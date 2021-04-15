export function converter(sentence: string) {
    let capitalized: string[] = [];
    let words = sentence.split(" ") //split the sentence into words
    words.forEach(word => {
        let capitalizedWord = word.slice(0, 1).toUpperCase() + word.slice(1) //capitalize the first letter of every word
        capitalized.push(capitalizedWord)
    })
    return capitalized.join(" ");
}
